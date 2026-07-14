import { Redirect, useLocalSearchParams } from "expo-router";
import {
  SettingsScreen,
  type SettingsSectionId,
} from "@/screens/SettingsScreen";

function isSettingsSection(value: unknown): value is SettingsSectionId {
  return (
    value === "reader" ||
    value === "sources" ||
    value === "appearance" ||
    value === "data"
  );
}

export default function SettingsSectionRoute() {
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const section = Array.isArray(params.section)
    ? params.section[0]
    : params.section;

  if (!isSettingsSection(section)) {
    return <Redirect href="/settings" />;
  }

  return <SettingsScreen section={section} />;
}
