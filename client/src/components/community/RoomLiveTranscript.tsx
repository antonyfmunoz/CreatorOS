import { useEffect, useMemo, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { Captions } from "lucide-react";

type LiveSegment = {
  id: string;
  speakerIdentity: string;
  text: string;
  final: boolean;
};

export function RoomLiveTranscript() {
  const room = useRoomContext();
  const [segments, setSegments] = useState<Map<string, LiveSegment>>(new Map());

  useEffect(() => {
    const topic = "lk.transcription";
    room.registerTextStreamHandler(topic, (reader, participant) => {
      void reader.readAll().then((text) => {
        const attributes = reader.info.attributes ?? {};
        const segmentId = attributes["lk.segment_id"] || reader.info.id;
        const final = attributes["lk.transcription_final"] === "true";
        setSegments((current) => {
          const next = new Map(current);
          next.set(segmentId, {
            id: segmentId,
            speakerIdentity: participant.identity,
            text,
            final,
          });
          while (next.size > 100) {
            const oldest = next.keys().next().value;
            if (!oldest) break;
            next.delete(oldest);
          }
          return next;
        });
      }).catch(() => undefined);
    });
    return () => room.unregisterTextStreamHandler(topic);
  }, [room]);

  const visible = useMemo(() => Array.from(segments.values()).slice(-20), [segments]);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-zinc-800 bg-black/95 lg:w-80">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <Captions className="h-4 w-4 text-cyan-400" />
        <div>
          <p className="text-xs font-bold text-white">Live transcript</p>
          <p className="text-[10px] text-zinc-500">Final segments are saved when transcription is active.</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {visible.length === 0 ? (
          <p className="text-xs leading-5 text-zinc-500">
            Captions will appear here after the disclosed transcription service joins.
          </p>
        ) : (
          visible.map((segment) => (
            <div key={segment.id} className="rounded-xl border border-zinc-900 bg-zinc-950 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-400">
                {segment.speakerIdentity.replace(/^creativesos-user-/, "Member ")}
              </p>
              <p className={`mt-1 text-xs leading-5 ${segment.final ? "text-zinc-200" : "text-zinc-500"}`}>
                {segment.text}
              </p>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
