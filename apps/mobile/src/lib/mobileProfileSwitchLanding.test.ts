import { describe, expect, test } from "bun:test";
import {
  createMobileProfileSwitchLanding,
  MOBILE_PROFILE_SWITCH_LANDING_GRACE_MS,
} from "./mobileProfileSwitchLanding";

describe("createMobileProfileSwitchLanding", () => {
  test("a launch with nothing held stays where it is", () => {
    expect(createMobileProfileSwitchLanding().consume()).toBe(false);
  });

  test("a remount during the flow lands once", () => {
    const landing = createMobileProfileSwitchLanding();
    landing.hold();
    expect(landing.consume()).toBe(true);
    expect(landing.consume()).toBe(false);
  });

  test("a failed or cancelled flow leaves no landing behind", () => {
    const landing = createMobileProfileSwitchLanding();
    landing.hold();
    landing.release(false);
    expect(landing.consume()).toBe(false);
  });

  test("a remount shortly after success lands; much later it does not", () => {
    let t = 0;
    const landing = createMobileProfileSwitchLanding(() => t);
    landing.hold();
    landing.release(true);
    t = MOBILE_PROFILE_SWITCH_LANDING_GRACE_MS - 1;
    expect(landing.consume()).toBe(true);
    landing.hold();
    landing.release(true);
    t += MOBILE_PROFILE_SWITCH_LANDING_GRACE_MS + 1;
    expect(landing.consume()).toBe(false);
  });

  test("a release after the remount consumed it does not revive it", () => {
    const landing = createMobileProfileSwitchLanding();
    landing.hold();
    expect(landing.consume()).toBe(true);
    landing.release(true);
    expect(landing.consume()).toBe(false);
  });
});
