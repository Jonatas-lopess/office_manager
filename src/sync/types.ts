export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface Peer {
  id: string;
  ip: string;
}

export type SendFn = (msg: any) => void;
export type MessageListener = (message: any, send: SendFn) => void;
