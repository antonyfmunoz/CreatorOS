import { forwardRef, useImperativeHandle, useRef, type HTMLAttributes, type MouseEvent, type PointerEvent, type WheelEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * A native horizontal scroller with desktop press-and-drag support. Touch and
 * trackpad scrolling stay native, so the rail feels like a social timeline
 * instead of a hidden scrollbar.
 */
export const HorizontalRail = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, onClickCapture, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onWheel, ...props }, forwardedRef) => {
    const railRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{ pointerId: number; startX: number; startScrollLeft: number; didMove: boolean } | null>(null);
    const suppressNextClick = useRef(false);
    useImperativeHandle(forwardedRef, () => railRef.current as HTMLDivElement);

    const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
      if (drag.current?.pointerId === event.pointerId) {
        suppressNextClick.current = drag.current.didMove;
        drag.current = null;
        event.currentTarget.classList.remove("is-dragging");
      }
    };

    const scrollWithWheel = (event: WheelEvent<HTMLDivElement>) => {
      onWheel?.(event);
      if (event.defaultPrevented || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const rail = event.currentTarget;
      if (rail.scrollWidth <= rail.clientWidth) return;
      rail.scrollLeft += event.deltaY;
      event.preventDefault();
    };

    return (
      <div
        ref={railRef}
        className={cn("horizontal-rail cursor-grab select-none active:cursor-grabbing", className)}
        onClickCapture={(event: MouseEvent<HTMLDivElement>) => {
          onClickCapture?.(event);
          if (!suppressNextClick.current) return;
          suppressNextClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (event.defaultPrevented || event.pointerType !== "mouse") return;
          suppressNextClick.current = false;
          drag.current = { pointerId: event.pointerId, startX: event.clientX, startScrollLeft: event.currentTarget.scrollLeft, didMove: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          onPointerMove?.(event);
          if (!drag.current || drag.current.pointerId !== event.pointerId) return;
          const distance = event.clientX - drag.current.startX;
          if (!drag.current.didMove && Math.abs(distance) >= 6) {
            drag.current.didMove = true;
            event.currentTarget.classList.add("is-dragging");
          }
          if (drag.current.didMove) {
            event.currentTarget.scrollLeft = drag.current.startScrollLeft - distance;
          }
        }}
        onPointerUp={(event) => {
          onPointerUp?.(event);
          stopDragging(event);
        }}
        onPointerCancel={(event) => {
          onPointerCancel?.(event);
          stopDragging(event);
        }}
        onWheel={scrollWithWheel}
        {...props}
      />
    );
  },
);

HorizontalRail.displayName = "HorizontalRail";
