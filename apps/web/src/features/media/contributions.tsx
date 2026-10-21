import type { FeatureContributions } from "@/shell/slots/types";

import { AudioMessageRenderer } from "./components/AudioMessageRenderer";
import { AudioPlayedBadge } from "./components/AudioPlayedBadge";
import { FileMessageRenderer } from "./components/FileMessageRenderer";
import { ImageMessageRenderer } from "./components/ImageMessageRenderer";
import { MediaComposerTool } from "./components/MediaComposerTool";
import { VoiceSendAction } from "./components/VoiceSendAction";
import { SharedMediaPanelTab } from "./components/SharedMediaPanelTab";

export const contributions: FeatureContributions = {
  composerTool: [
    {
      id: "media-attach",
      order: 20,
      Component: MediaComposerTool,
    },
  ],
  composerSendAction: [{ id: "media-voice", Component: VoiceSendAction }],
  bubbleMetaBadge: [{ id: "media-audio-played", Component: AudioPlayedBadge }],
  messageRenderer: [
    { type: "image", Component: ImageMessageRenderer },
    { type: "file", Component: FileMessageRenderer },
    { type: "audio", Component: AudioMessageRenderer },
  ],
  rightPanelTab: [
    {
      id: "media-shared",
      order: 30,
      labelKey: "sharedMedia",
      Component: SharedMediaPanelTab,
    },
  ],
};
