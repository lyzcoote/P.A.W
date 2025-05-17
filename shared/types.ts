
// Old interface for agent store
export interface Agent {
  [id: string]: {
    config: AgentConfig;
    status: AgentStatus;
  };
}

/*
  Helper types for the project
*/
export interface AgentStatus {
  status: "idle" | "running" | "stopped" | "error" | "starting";
}

export interface AgentConfig {
  startUrl: string;
  headless: boolean;
  scrapeData: boolean;
  muteAudio: boolean;
  id?: string;
}

export interface JitsiConfig {
  botName: string;
  disablePreJoin: boolean;
  startAudioOnly: boolean;
  startWithAudioMuted: boolean;
  startWithVideoMuted: boolean;
  disableInitialGUM: boolean;
}

// New interface for agent store
export interface NewAgent {
  id: string;
  agentConfig: AgentConfig;
  jitsiConfig: JitsiConfig;
  status: AgentStatus;
  version?: string;
}

/**
 * Represents the structure of the response when validating a license.
 */
export interface ValidateLicenseResponse {
  success: boolean;
  valid: boolean;
  license?: License; // Included if valid
  message?: string; // Included if invalid or error
}

/**
 * Represents the structure of a license object stored in the database
 * and returned by API calls.
 */
export interface License {
  key: string;
  productId: string;
  createdAt: string;
  expirationDate: string | null;
  isValid: boolean;
}