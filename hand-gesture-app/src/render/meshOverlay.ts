/**
 * Persistent SVG mesh overlay.
 *
 * Replaces the old per-frame canvas redraw. Each tracked entity (face, pose,
 * each hand) owns a persistent <g> that is never recreated; instead:
 *
 *   - the group's overall position is updated via `transform: translate3d(...)`
 *     using the interpolated centroid of its landmarks,
 *   - the joints (circles) and edges (lines) inside the group keep persistent
 *     DOM nodes whose local coordinates are interpolated toward their targets
 *     each frame (smooth motion instead of teleporting),
 *   - when an entity stops being detected it KEEPS its latest geometry and
 *     fades its opacity toward a translucent floor rather than disappearing.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Per-frame interpolation factor (0..1). Higher = snappier, lower = smoother. */
const JOINT_LERP    = 0.4
const CENTROID_LERP = 0.45
const OPACITY_LERP  = 0.18

/** Opacity an entity fades to once it is no longer detected. */
const FADE_FLOOR = 0.16

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface EntitySpec {

  /** Stable unique id, e.g. 'face', 'pose', 'hand-Left'. */
  id:           string;
  connections:  [number, number][];
  color:        string;
  pointColor?:  string;
  pointRadius?: number;
  lineWidth?:   number;
  drawPoints?:  boolean;
}

interface JointState {
  circle: SVGCircleElement | null;
  // local coordinates (relative to the group centroid)
  curX:   number;
  curY:   number;
  tgtX:   number;
  tgtY:   number;
}

interface EdgeState {
  line:  SVGLineElement;
  start: number;
  end:   number;
}

interface EntityState {
  spec:        EntitySpec;
  group:       SVGGElement;
  joints:      Map<number, JointState>;
  edges:       EdgeState[];
  // interpolated centroid in pixel space
  curCx:       number;
  curCy:       number;
  tgtCx:       number;
  tgtCy:       number;
  curOpacity:  number;
  tgtOpacity:  number;
  present:     boolean;
  initialised: boolean;
}

function lerp (a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export class MeshOverlay {
  private svg: SVGSVGElement
  private entities = new Map<string, EntityState>()

  constructor (parent: HTMLElement) {
    this.svg    = document.createElementNS(SVG_NS, 'svg')
    this.svg.id = 'mesh-overlay'
    this.svg.setAttribute('width', '100%')
    this.svg.setAttribute('height', '100%')
    Object.assign(this.svg.style, {
      position:      'absolute',
      top:           '0',
      left:          '0',
      width:         '100%',
      height:        '100%',
      pointerEvents: 'none',
      zIndex:        '5',
      overflow:      'visible'
    } as CSSStyleDeclaration)
    parent.appendChild(this.svg)
  }

  /** Match the SVG viewBox to the on-screen pixel size of the container. */
  setViewport (width: number, height: number): void {
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }

  private ensureEntity (spec: EntitySpec): EntityState {
    let entity = this.entities.get(spec.id)
    if (entity) {
      entity.spec = spec
      return entity
    }

    const group            = document.createElementNS(SVG_NS, 'g')
    group.dataset.entity   = spec.id
    group.style.willChange = 'transform, opacity'
    this.svg.appendChild(group)

    // Pre-create edge lines so the DOM nodes are persistent.
    const edges: EdgeState[] = spec.connections.map(([ start, end ]) => {
      const line = document.createElementNS(SVG_NS, 'line')
      line.setAttribute('stroke', spec.color)
      line.setAttribute('stroke-width', String(spec.lineWidth ?? 2))
      line.setAttribute('stroke-linecap', 'round')
      group.appendChild(line)
      return { line, start, end }
    })

    entity = {
      spec,
      group,
      joints:      new Map(),
      edges,
      curCx:       0,
      curCy:       0,
      tgtCx:       0,
      tgtCy:       0,
      curOpacity:  0,
      tgtOpacity:  0,
      present:     false,
      initialised: false
    }
    this.entities.set(spec.id, entity)
    return entity
  }

  private ensureJoint (entity: EntityState, index: number): JointState {
    let joint = entity.joints.get(index)
    if (joint)
      return joint

    let circle: SVGCircleElement | null = null
    if (entity.spec.drawPoints !== false) {
      circle = document.createElementNS(SVG_NS, 'circle')
      circle.setAttribute('r', String(entity.spec.pointRadius ?? 3))
      circle.setAttribute('fill', entity.spec.pointColor ?? '#FFFFFF')
      entity.group.appendChild(circle)
    }

    joint = { circle, curX: 0, curY: 0, tgtX: 0, tgtY: 0 }
    entity.joints.set(index, joint)
    return joint
  }

  /**
   * Provide fresh projected (pixel-space) landmark positions for an entity.
   * Call once per detected entity per frame.
   */
  update (spec: EntitySpec, points: ProjectedPoint[]): void {
    const entity = this.ensureEntity(spec)

    // Centroid of all provided points (target for the group translate3d).
    let sumX = 0
    let sumY = 0
    for (const p of points) {
      sumX += p.x
      sumY += p.y
    }

    const cx = sumX / points.length
    const cy = sumY / points.length

    entity.tgtCx      = cx
    entity.tgtCy      = cy
    entity.tgtOpacity = 1
    entity.present    = true

    // Joint targets are stored relative to the centroid.
    points.forEach((p, index) => {
      const joint = this.ensureJoint(entity, index)
      joint.tgtX  = p.x - cx
      joint.tgtY  = p.y - cy
    })

    // First time we see this entity: snap rather than animate in from (0,0).
    if (!entity.initialised) {
      entity.curCx      = cx
      entity.curCy      = cy
      entity.curOpacity = 0
      entity.joints.forEach(j => {
        j.curX = j.tgtX
        j.curY = j.tgtY
      })
      entity.initialised = true
    }
  }

  /** Mark an entity as no longer detected: keep geometry, fade out. */
  markAbsent (id: string): void {
    const entity = this.entities.get(id)
    if (!entity)
      return
    entity.present    = false
    entity.tgtOpacity = FADE_FLOOR
  }

  /** Mark every entity absent (called before each frame's updates). */
  markAllAbsent (): void {
    this.entities.forEach(entity => {
      entity.present    = false
      entity.tgtOpacity = FADE_FLOOR
    })
  }

  /**
   * Advance interpolation by one frame and write to the DOM.
   * Should be called once per animation frame after all `update`/`markAbsent`.
   */
  render (): void {
    this.entities.forEach(entity => {
      // Interpolate opacity always; interpolate geometry only while present
      // (absent entities freeze in place and merely fade).
      entity.curOpacity          = lerp(entity.curOpacity, entity.tgtOpacity, OPACITY_LERP)
      entity.group.style.opacity = entity.curOpacity.toFixed(3)

      if (entity.present) {
        entity.curCx = lerp(entity.curCx, entity.tgtCx, CENTROID_LERP)
        entity.curCy = lerp(entity.curCy, entity.tgtCy, CENTROID_LERP)
        entity.joints.forEach(j => {
          j.curX = lerp(j.curX, j.tgtX, JOINT_LERP)
          j.curY = lerp(j.curY, j.tgtY, JOINT_LERP)
        })
      }

      // Whole-group position via translate3d (GPU-friendly, persistent node).
      entity.group.style.transform =
        `translate3d(${entity.curCx.toFixed(2)}px, ${entity.curCy.toFixed(2)}px, 0)`

      // Joint circles (local coords relative to centroid).
      entity.joints.forEach(j => {
        if (j.circle) {
          j.circle.setAttribute('cx', j.curX.toFixed(2))
          j.circle.setAttribute('cy', j.curY.toFixed(2))
        }
      })

      // Edge lines connect interpolated joint positions.
      for (const edge of entity.edges) {
        const a = entity.joints.get(edge.start)
        const b = entity.joints.get(edge.end)
        if (a && b) {
          edge.line.setAttribute('x1', a.curX.toFixed(2))
          edge.line.setAttribute('y1', a.curY.toFixed(2))
          edge.line.setAttribute('x2', b.curX.toFixed(2))
          edge.line.setAttribute('y2', b.curY.toFixed(2))
          edge.line.style.display = ''
        }
        else
          edge.line.style.display = 'none'
      }
    })
  }
}
