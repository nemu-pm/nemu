import { useEffect, useState } from "react";
import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type NetworkState,
} from "expo-network";
import { classifyMobileNetworkState } from "./mobileConnectivity";

export type MobileConnectivityState = {
  /** True when the device reports no usable network interface. */
  offline: boolean;
  /** True while the first network probe is still in flight. */
  resolving: boolean;
};

function toState(state: NetworkState): MobileConnectivityState {
  return {
    offline: classifyMobileNetworkState(state) === "offline",
    resolving: false,
  };
}

/**
 * Reactive connectivity for user-facing surfaces (reader offline notice,
 * retry banners). Uses the shared `classifyMobileNetworkState` semantics so
 * "connected" means the same thing here as it does in the data layer.
 */
export function useMobileConnectivity(): MobileConnectivityState {
  const [state, setState] = useState<MobileConnectivityState>({
    offline: false,
    resolving: true,
  });

  useEffect(() => {
    let mounted = true;
    void getNetworkStateAsync()
      .then((network) => {
        if (mounted) setState(toState(network));
      })
      .catch(() => {
        // An unavailable probe is not evidence of an offline device. Resolve
        // optimistically and let the native listener publish the next known
        // state instead of leaving every notice in a permanent loading state.
        if (mounted) setState({ offline: false, resolving: false });
      });
    const subscription = addNetworkStateListener((network) => {
      if (mounted) setState(toState(network));
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return state;
}
