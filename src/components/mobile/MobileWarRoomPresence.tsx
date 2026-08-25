import { WarRoomRail, type WarRoomRailProps } from '../WarRoomRail';

export function MobileWarRoomPresence(props: WarRoomRailProps): JSX.Element {
  return (
    <section className="mobile-war-room-presence" data-testid="mobile-war-room-presence" data-visual-key="mobile-warroom-presence">
      <WarRoomRail {...props} forceExpanded />
    </section>
  );
}
