import { LiveKitRoom, RoomAudioRenderer, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { Button } from "@/components/ui/button";
import { RoomLiveTranscript } from "./RoomLiveTranscript";
import { RoomMediaPanel } from "./RoomMediaPanel";

type CommunityLiveSessionProps = {
  roomId: string;
  roomTitle: string;
  token: string;
  serverUrl: string;
  mediaError: string;
  onError: (message: string) => void;
  onLeave: () => void;
};

export default function CommunityLiveSession(props: CommunityLiveSessionProps) {
  return (
    <main className="min-h-dvh bg-black text-white">
      <header className="flex h-14 items-center justify-between border-b border-zinc-800 px-4">
        <div className="min-w-0"><p className="truncate text-sm font-bold">{props.roomTitle}</p><p className="text-[11px] text-emerald-400">Live in CreativesOS</p></div>
        <Button variant="ghost" size="sm" className="text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={props.onLeave}>Leave room</Button>
      </header>
      <section className="h-[calc(100dvh-3.5rem)] bg-zinc-950" data-lk-theme="default">
        {props.mediaError && <div role="alert" className="absolute left-1/2 top-16 z-50 w-[min(90vw,32rem)] -translate-x-1/2 rounded-xl border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200 shadow-xl">{props.mediaError}</div>}
        <LiveKitRoom token={props.token} serverUrl={props.serverUrl} connect audio={false} video={false} onDisconnected={props.onLeave} onError={(error) => props.onError(error.message)}>
          <div className="flex h-full min-h-0 flex-col lg:flex-row">
            <div className="min-h-0 min-w-0 flex-1"><VideoConference /><RoomAudioRenderer /></div>
            <div className="flex max-h-[45dvh] w-full min-h-0 flex-col border-t border-zinc-800 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
              <div className="max-h-72 overflow-y-auto border-b border-zinc-800 p-3"><RoomMediaPanel roomId={props.roomId} compact /></div>
              <div className="min-h-0 flex-1"><RoomLiveTranscript /></div>
            </div>
          </div>
        </LiveKitRoom>
      </section>
    </main>
  );
}
