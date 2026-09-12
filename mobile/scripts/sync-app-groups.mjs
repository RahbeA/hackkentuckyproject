/**
 * Create/link group.com.app.dart on both App IDs and restore push on the main app.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { Auth, AppGroup, BundleId, CapabilityType, CapabilityTypeOption } = require(
  "/opt/homebrew/lib/node_modules/eas-cli/node_modules/@expo/apple-utils/build/index.js",
);

const TEAM_ID = "UL89HA8QZ8";
const APPLE_ID = "lenchoabass@gmail.com";
const GROUP = "group.com.app.dart";

const cookies = JSON.parse(readFileSync(`${process.env.HOME}/.app-store/auth/${APPLE_ID}/cookie`, "utf8"));
const session = await Auth.tryRestoringAuthStateFromUserCredentialsAsync(
  { username: APPLE_ID, teamId: TEAM_ID, cookies },
  { autoResolveProvider: true },
);
if (!session) throw new Error("Apple session expired. Run an EAS iOS build once to log in again.");
const ctx = session.context;

const existing = await AppGroup.getAsync(ctx);
console.log(
  "Existing App Groups:",
  existing.map((g) => `${g.attributes.identifier} (${g.id})`).join(", ") || "(none)",
);
let group = existing.find((g) => g.attributes.identifier === GROUP);
if (!group) {
  group = await AppGroup.createAsync(ctx, { identifier: GROUP, name: "DART" });
  console.log(`Created ${GROUP} (${group.id})`);
} else {
  console.log(`Using ${GROUP} (${group.id})`);
}

for (const identifier of ["com.app.dart", "com.app.dart.widget"]) {
  const bundleId = await BundleId.findAsync(ctx, { identifier });
  if (!bundleId) throw new Error(`Missing App ID ${identifier}`);
  console.log(`Linking ${GROUP} to ${identifier}`);
  await bundleId.updateBundleIdCapabilityAsync([
    {
      capabilityType: CapabilityType.APP_GROUP,
      option: CapabilityTypeOption.ON,
      relationships: { appGroups: [group.id] },
    },
  ]);
}

const main = await BundleId.findAsync(ctx, { identifier: "com.app.dart" });
console.log("Re-enabling Push Notifications on com.app.dart");
await main.updateBundleIdCapabilityAsync([
  { capabilityType: CapabilityType.PUSH_NOTIFICATIONS, option: CapabilityTypeOption.ON },
]);

console.log("Done. Next: npx eas-cli@latest build -p ios --profile production --auto-submit");
