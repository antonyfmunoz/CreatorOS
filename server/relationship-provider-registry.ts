import { getRelationshipAdapter, registerRelationshipAdapter } from "./relationship-channel-adapters";
import { nativeRelationshipAdapter } from "./relationship-native-adapter";
import { instagramRelationshipAdapter } from "./relationship-instagram-adapter";

export function initializeRelationshipProviderRegistry() {
  if (!getRelationshipAdapter(nativeRelationshipAdapter.provider)) registerRelationshipAdapter(nativeRelationshipAdapter);
  if (!getRelationshipAdapter(instagramRelationshipAdapter.provider)) registerRelationshipAdapter(instagramRelationshipAdapter);
}
