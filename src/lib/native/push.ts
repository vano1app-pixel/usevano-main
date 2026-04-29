import { PushNotifications, type Token, type PushNotificationSchema, type ActionPerformed } from "@capacitor/push-notifications";
import { isNative } from "./platform";

export type PushHandlers = {
  onToken?: (token: string) => void | Promise<void>;
  onRegistrationError?: (error: unknown) => void;
  onNotificationReceived?: (notification: PushNotificationSchema) => void;
  onNotificationTapped?: (action: ActionPerformed) => void;
};

let initialized = false;

export async function initNativePush(handlers: PushHandlers = {}): Promise<void> {
  if (!isNative || initialized) return;
  initialized = true;

  const permission = await PushNotifications.checkPermissions();
  let granted = permission.receive === "granted";
  if (!granted) {
    const requested = await PushNotifications.requestPermissions();
    granted = requested.receive === "granted";
  }
  if (!granted) return;

  await PushNotifications.addListener("registration", (token: Token) => {
    void handlers.onToken?.(token.value);
  });

  await PushNotifications.addListener("registrationError", (err) => {
    handlers.onRegistrationError?.(err);
  });

  await PushNotifications.addListener("pushNotificationReceived", (n) => {
    handlers.onNotificationReceived?.(n);
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
    handlers.onNotificationTapped?.(a);
  });

  await PushNotifications.register();
}
