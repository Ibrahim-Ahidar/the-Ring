import type {
  IncomingMessageRequest,
  OutgoingMessageRequest,
} from "../types";

export type MessageRequestsState = {
  incoming: IncomingMessageRequest[];
  outgoing: OutgoingMessageRequest[];
  pendingIncomingCount: number;
  loading: boolean;
  errorCode: string | null;
  actingRequestId: string | null;
};

export type MessageRequestsAction =
  | { type: "load_start" }
  | {
      type: "load_success";
      incoming: IncomingMessageRequest[];
      outgoing: OutgoingMessageRequest[];
      pendingIncomingCount: number;
    }
  | { type: "load_error"; code: string }
  | { type: "act_start"; requestId: string }
  | { type: "act_end" }
  | {
      type: "patch_incoming";
      requestId: string;
      patch: Partial<IncomingMessageRequest>;
    }
  | {
      type: "patch_outgoing";
      requestId: string;
      patch: Partial<OutgoingMessageRequest>;
    };
