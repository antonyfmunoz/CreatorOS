import { getRelationshipAdapter, registerRelationshipAdapter } from "./relationship-channel-adapters";
import { nativeRelationshipAdapter } from "./relationship-native-adapter";
import { instagramRelationshipAdapter } from "./relationship-instagram-adapter";
import { xRelationshipAdapter } from "./relationship-x-adapter";
import { messengerRelationshipAdapter, whatsappRelationshipAdapter } from "./relationship-meta-adapters";

export function initializeRelationshipProviderRegistry() {
  if (!getRelationshipAdapter(nativeRelationshipAdapter.provider)) registerRelationshipAdapter(nativeRelationshipAdapter);
  if (!getRelationshipAdapter(instagramRelationshipAdapter.provider)) registerRelationshipAdapter(instagramRelationshipAdapter);
  if (!getRelationshipAdapter(xRelationshipAdapter.provider)) registerRelationshipAdapter(xRelationshipAdapter);
  if (!getRelationshipAdapter(messengerRelationshipAdapter.provider)) registerRelationshipAdapter(messengerRelationshipAdapter);
  if (!getRelationshipAdapter(whatsappRelationshipAdapter.provider)) registerRelationshipAdapter(whatsappRelationshipAdapter);
}
