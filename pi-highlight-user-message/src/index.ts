import {
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_USER_MESSAGE_BORDER_CONFIG, type UserMessageBorderConfig
} from "./types.js";
import registerNativeUserMessageBox from "./user-message-box-native.js";

export default function toolDisplayExtension(pi: ExtensionAPI): void {
  const getConfig = (): UserMessageBorderConfig => DEFAULT_USER_MESSAGE_BORDER_CONFIG;

  registerNativeUserMessageBox(pi, getConfig);
}
