import React, { Suspense } from 'react';
import { RenderOptions } from 'react-testing-library';
import { renderHook } from 'react-hooks-testing-library';

import { MockNetworkManager } from './managers';
import {
  State,
  NetworkManager,
  SubscriptionManager,
  PollingSubscription,
} from '../index';

export default function makeRenderRestHook(
  makeProvider: (
    manager: NetworkManager,
    subManager: SubscriptionManager<any>,
    initialState?: State<unknown>,
  ) => React.ComponentType<{ children: React.ReactChild }>,
) {
  const manager = new MockNetworkManager();
  const subManager = new SubscriptionManager(PollingSubscription);
  function renderRestHook<P, R>(
    callback: (props: P) => R,
    options?: {
      initialProps?: P;
      initialState?: State<unknown>;
    } & RenderOptions,
  ) {
    const Provider: React.ComponentType<any> = makeProvider(
      manager,
      subManager,
      options && options.initialState,
    );
    const Wrapper = options && options.wrapper;
    const wrapper: React.ComponentType<any> = Wrapper
      ? ({ children }: { children: React.ReactChild }) => (
        <Provider>
          <Wrapper>{children}</Wrapper>
        </Provider>
      )
      : Provider;
    return renderHook(callback, {
      ...options,
      wrapper,
    });
  }
  renderRestHook.cleanup = () => {
    manager.cleanup();
    subManager.cleanup();
  };
  return renderRestHook;
}
