import React from 'react';
// eslint-disable-next-line @typescript-eslint/camelcase
import { unstable_scheduleCallback } from 'scheduler';
import { cleanup, renderHook, act } from 'react-hooks-testing-library';
import createEnhancedReducerHook from '../middleware';
import { MiddlewareAPI } from '../../../types';

function ignoreError(e: Event) {
  e.preventDefault();
}
beforeEach(() => {
  window.addEventListener('error', ignoreError);
});
afterEach(() => {
  window.removeEventListener('error', ignoreError);
});
afterEach(cleanup);

describe('createEnhancedReducerHook', () => {
  const makeTestActionMiddleware = (test: Function) => () => {
    return (next: any) => (action: any) => {
      test(action);
      return next(action);
    };
  };
  const makeTestMiddleware = (spy: Function) => (methods: MiddlewareAPI) => {
    spy(methods);
    return (next: any) => (action: any) => next(action);
  };
  const dispatchingMiddleware = ({ dispatch }: MiddlewareAPI) => {
    return (next: any) => (action: any) => {
      if (action.type === 'dispatch') {
        dispatch({ ...action, type: 'nothing' });
      }
      return next(action);
    };
  };
  const makeStatefulMiddleware = ({
    callBefore,
    callAfter,
  }: {
    callBefore: Function;
    callAfter: Function;
  }) => ({ getState }: MiddlewareAPI) => {
    return (next: any) => (action: any) => {
      callBefore(getState());
      next(action);
      // eslint-disable-next-line @typescript-eslint/camelcase
      unstable_scheduleCallback(() => callAfter(getState()), {});
    };
  };

  test('runs through a single middleware', () => {
    const faker = jest.fn();
    const logger = makeTestActionMiddleware(faker);
    const { result } = renderHook(() => {
      const useEnhancedReducer = createEnhancedReducerHook(logger);
      return useEnhancedReducer(state => state, {});
    });
    const [state, dispatch] = result.current;

    expect(faker.mock.calls.length).toBe(0);
    const action = { type: 5 };
    act(() => {
      dispatch(action);
    });
    expect(faker.mock.calls.length).toBe(1);
    expect(faker.mock.calls[0][0]).toBe(action);
    act(() => {
      dispatch(action);
    });
    expect(faker.mock.calls.length).toBe(2);
  });

  it('wraps dispatch method with middleware once', () => {
    const [faker, statefaker] = [jest.fn(), jest.fn()];
    const methodspy = makeTestMiddleware(faker);
    const statespy = makeTestMiddleware(({ getState }: MiddlewareAPI) =>
      statefaker(getState()),
    );

    const { result } = renderHook(() => {
      const useEnhancedReducer = createEnhancedReducerHook(methodspy, statespy);
      return useEnhancedReducer(state => state, { double: 5 });
    });
    const [state, dispatch] = result.current;

    const action = { type: 5 };
    act(() => {
      dispatch(action);
      dispatch(action);
    });

    expect(faker.mock.calls.length).toEqual(1);

    expect(faker.mock.calls[0][0]).toHaveProperty('getState');
    expect(faker.mock.calls[0][0]).toHaveProperty('dispatch');

    expect(statefaker.mock.calls[0][0]).toEqual({ double: 5 });
  });

  test('reducer to work properly', () => {
    const logger = makeTestActionMiddleware(() => {});

    const { result } = renderHook(() => {
      const useEnhancedReducer = createEnhancedReducerHook(logger);
      return useEnhancedReducer(
        (state, action) => ({ ...state, omlet: action.payload }),
        { eggs: 'bacon' },
      );
    });
    let [state, dispatch] = result.current;
    act(() => {
      dispatch({ payload: 5 });
    });
    [state, dispatch] = result.current;
    expect(state).toEqual({
      eggs: 'bacon',
      omlet: 5,
    });
    act(() => {
      dispatch({ payload: 'chicken' });
    });
    [state, dispatch] = result.current;
    expect(state).toEqual({
      eggs: 'bacon',
      omlet: 'chicken',
    });
  });

  test('should work with middlewares that call dispatch', () => {
    const faker = jest.fn();
    const logger = makeTestActionMiddleware(faker);

    const { result } = renderHook(() => {
      const useEnhancedReducer = createEnhancedReducerHook(
        logger,
        dispatchingMiddleware,
      );
      return useEnhancedReducer(state => state, {});
    });
    const [state, dispatch] = result.current;
    expect(faker.mock.calls.length).toBe(0);
    let action: any = { type: 'hi' };
    act(() => {
      dispatch(action);
    });
    expect(faker.mock.calls.length).toBe(1);
    expect(faker.mock.calls[0][0]).toBe(action);
    action = { type: 'dispatch', payload: 5 };
    act(() => {
      dispatch(action);
    });
    expect(faker.mock.calls.length).toBe(3);
    expect(faker.mock.calls[2][0]).toEqual({ type: 'nothing', payload: 5 });
  });

  test('should work with middlewares that getState()', async () => {
    jest.useFakeTimers();
    const callBefore = jest.fn();
    const callAfter = jest.fn();
    const logger = makeStatefulMiddleware({ callBefore, callAfter });

    const reducer = (state: { counter: number }) => ({
      ...state,
      counter: state.counter + 1,
    });
    const { result } = renderHook(() => {
      const useEnhancedReducer = createEnhancedReducerHook(logger);
      return useEnhancedReducer(reducer, { counter: 0 });
    });
    let [state, dispatch] = result.current;
    expect(callBefore.mock.calls.length).toBe(0);
    let action: any = { type: 'hi' };
    act(() => {
      dispatch(action);
    });
    jest.runAllTimers();
    [state, dispatch] = result.current;
    expect(callBefore.mock.calls.length).toBe(1);
    expect(callAfter.mock.calls.length).toBe(1);
    expect(callBefore.mock.calls[0][0]).toEqual({ counter: 0 });
    expect(callAfter.mock.calls[0][0]).toEqual({ counter: 1 });
    expect(callAfter.mock.calls[0][0]).toEqual(state);
    action = { type: 'dispatch', payload: 5 };
    act(() => {
      dispatch(action);
    });
    jest.runAllTimers();
    expect(callBefore.mock.calls[1][0]).toEqual({ counter: 1 });
    expect(callAfter.mock.calls[1][0]).toEqual({ counter: 2 });
  });

  it('warns when dispatching during middleware setup', () => {
    function dispatchingMiddleware({ dispatch }: { dispatch: Function }) {
      dispatch({ type: 'dispatch', payload: 5 });
      return (next: Function) => (action: any) => next(action);
    }
    const { result } = renderHook(() => {
      createEnhancedReducerHook(dispatchingMiddleware)(state => state, {});
    });
    expect(result.error).toBeDefined();
    expect(result.error.message).toMatchSnapshot();
  });
});
