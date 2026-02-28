import { registerAdapter } from "./registry";
import { qobuzAdapter } from "./adapters/qobuz.adapter";
import { fallbackAdapter } from "./adapters/fallback.adapter";

// register specific adapters first (they should win)
registerAdapter(qobuzAdapter);

// fallback LAST
registerAdapter(fallbackAdapter);

export * from "./registry";