/**
 * Minimal migration shape. A migration moves a packet JSON object from
 * `from` schema_version to `to` schema_version. `up` must be pure.
 *
 * Keep this surface tiny: when v2 lands, we'll add `down` only if there's
 * a real reason. YAGNI for now.
 */
export interface Migration {
  readonly from: string;
  readonly to: string;
  readonly up: (packet: object) => object;
}
