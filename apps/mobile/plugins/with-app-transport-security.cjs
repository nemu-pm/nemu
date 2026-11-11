const { withInfoPlist } = require("expo/config-plugins");
const { firstPartyHttpsOnlyDomains } = require("./with-third-party-jsc.cjs");

/**
 * App Transport Security, the iOS counterpart of the Android network security
 * config (with-third-party-jsc). Users type their own server's address (a
 * Komga, Kavita, Suwayomi or LANraragi server by IP, `.local`, a LAN name, a
 * dynamic-DNS or Tailscale name), and a home server is usually plain http, so
 * plain http is allowed to any host. Source traffic stays behind the native
 * SSRF policy (loopback proxy, scoped local-network grants). First-party
 * authentication, sync and API hosts keep full ATS, so they can never be
 * downgraded.
 *
 * The dictionary is written whole: on iOS 10+ NSAllowsArbitraryLoads is
 * ignored when NSAllowsLocalNetworking, NSAllowsArbitraryLoadsInWebContent or
 * NSAllowsArbitraryLoadsForMedia is present, so one left over from the
 * template or another plugin would silently block http again.
 */
function applyAppTransportSecurity(infoPlist) {
  const exceptionDomains = {};
  for (const domain of firstPartyHttpsOnlyDomains) {
    exceptionDomains[domain] = {
      NSIncludesSubdomains: true,
      NSExceptionAllowsInsecureHTTPLoads: false,
    };
  }
  infoPlist.NSAppTransportSecurity = {
    NSAllowsArbitraryLoads: true,
    NSExceptionDomains: exceptionDomains,
  };
  return infoPlist;
}

function withAppTransportSecurity(config) {
  return withInfoPlist(config, (plistConfig) => {
    plistConfig.modResults = applyAppTransportSecurity(plistConfig.modResults);
    return plistConfig;
  });
}

module.exports = withAppTransportSecurity;
module.exports.applyAppTransportSecurity = applyAppTransportSecurity;
