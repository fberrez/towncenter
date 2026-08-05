// `force-dynamic` is mandatory: without it Next prerenders this page at build
// time and the HTML freezes the database state, invisibly in `next dev`.
// `PageProps<"/">` only exists after `next typegen`, which runs before `tsc`.

import {
  getClusters,
  getProgression,
  getTargetDetail,
  getZoneStats,
  listFront,
  listTargetsInBbox,
  listZones,
} from "@/app/queries";
import { TerritoryMap, type NafOption } from "@/components/map/TerritoryMap";
import { requireUser } from "@/lib/accounts";
import { DEFAULT_FRAME, frameToText, textToFrame } from "@/components/map/frame";
import {
  SIRENE_EXTRA_NAF,
  SIRENE_MAX_PER_PAGE,
  SIRENE_TARGET_NAF,
} from "@/lib/sources/sirene";

import "@/components/map/map.css";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// checked before the query: an arbitrary string off the address bar has no
// business reaching a `where`. refused here, the screen opens with no record.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NAF: NafOption[] = [...SIRENE_TARGET_NAF, ...SIRENE_EXTRA_NAF].map((target) => ({
  code: target.code,
  label: target.label,
}));

const DEFAULT_NAF: string[] = SIRENE_TARGET_NAF.map((target) => target.code);

export default async function Page(props: PageProps<"/">) {
  // the owner bounds EVERY read below, and is read first.
  const owner = await requireUser();

  const params = await props.searchParams;

  const frame = textToFrame(first(params.frame)) ?? DEFAULT_FRAME;
  const frameText = frameToText(frame);

  const requestedTarget = first(params.target);
  const targetId = requestedTarget && UUID_PATTERN.test(requestedTarget) ? requestedTarget : null;

  // ensureGoogleRetention() runs from listTargetsInBbox, getTargetDetail and
  // getSeasonReport only: dropping the last of them from this list drops the
  // 30-day Google purge with it.
  const [inFrame, stats, sectors, front, progression, detail] =
    await Promise.all([
      listTargetsInBbox(owner, frame),
      getZoneStats(owner, frame),
      listZones(owner, 24),
      listFront(owner, 5),
      getProgression(owner),
      targetId ? getTargetDetail(owner, targetId) : Promise.resolve(null),
    ]);

  // clustered in TypeScript, not SQL: the grouping depends on the expected
  // value, which is recomputed on read and exists in no column.
  const clusters = getClusters(inFrame.rows);

  return (
    <main className="territory">
      <TerritoryMap
        account={owner}
        frame={frame}
        frameText={frameText}
        targets={inFrame.rows}
        total={inFrame.total}
        truncated={inFrame.truncated}
        outcomeCount={inFrame.outcomeCount}
        clusters={clusters}
        sectors={sectors}
        front={front}
        stats={stats}
        progression={progression}
        detail={detail}
        naf={NAF}
        defaultNaf={DEFAULT_NAF}
        fichesParPage={SIRENE_MAX_PER_PAGE}
      />
    </main>
  );
}
