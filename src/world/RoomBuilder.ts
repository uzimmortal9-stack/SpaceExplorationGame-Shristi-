import * as THREE from 'three';
import type { RoomDefinition } from '../types';
import type { DoorSystem } from '../systems/DoorSystem';
import type { PropFactory } from './PropFactory';
import { createPanelTexture, screenMaterial } from '../core/CanvasTexture';
import { normalizedBox } from './geometryAlignment';
import { COLORS, emissive, metal, shared } from './materials';

export class RoomBuilder {
  private props: PropFactory;
  private doors: DoorSystem;

  constructor(props: PropFactory, doors: DoorSystem) {
    this.props = props;
    this.doors = doors;
  }

  build(definition: RoomDefinition): THREE.Group {
    const room = new THREE.Group();
    room.name = `room:${definition.id}`;
    room.position.set(definition.x, 0, definition.z);
    const { width, depth } = definition;
    const height = 3.25;

    const floor = new THREE.Mesh(normalizedBox(width, 0.12, depth, 'floor'), shared.floor);
    floor.position.y = -0.12;
    const inset = new THREE.Mesh(normalizedBox(width - 0.5, 0.018, depth - 0.5, 'floor'), shared.floorInset);
    inset.position.y = 0.002;
    const ceiling = new THREE.Mesh(normalizedBox(width, 0.12, depth, 'ceiling'), shared.ceiling);
    ceiling.position.y = height;
    room.add(floor, inset, ceiling);

    // Wall construction leaves a clean 2.9 m central opening toward the corridor.
    const innerX = definition.side === 'left' ? width / 2 : -width / 2;
    const outerX = -innerX;
    const outerWall = this.wall(0.18, height, depth);
    outerWall.position.set(outerX, 0, 0);
    room.add(outerWall);
    this.props.solid(outerWall);

    const frontWall = this.wall(width, height, 0.18);
    frontWall.position.set(0, 0, -depth / 2);
    const backWall = frontWall.clone();
    backWall.position.z = depth / 2;
    room.add(frontWall, backWall);
    this.props.solid(frontWall);
    this.props.solid(backWall);

    const opening = 2.9;
    const segment = (depth - opening) / 2;
    for (const z of [-(opening / 2 + segment / 2), opening / 2 + segment / 2]) {
      const wall = this.wall(0.18, height, segment);
      wall.position.set(innerX, 0, z);
      room.add(wall);
      this.props.solid(wall);
    }

    const doorCenter = new THREE.Vector3(definition.x + innerX, 0, definition.z);
    const door = this.doors.create(definition.id, doorCenter, 'z', opening, 2.7);
    room.parent?.add(door);
    // Parent is not available until caller attaches the room, so mark for extraction.
    door.userData.attachToShipRoot = true;
    room.add(door);
    door.position.sub(room.position);

    const trimMaterial = emissive(definition.color, 1.25);
    const floorTrim = new THREE.Mesh(normalizedBox(width - 0.45, 0.025, 0.055, 'floor'), trimMaterial);
    floorTrim.position.set(0, 0.01, -depth / 2 + 0.2);
    const floorTrim2 = floorTrim.clone();
    floorTrim2.position.z = depth / 2 - 0.2;
    room.add(floorTrim, floorTrim2);

    const lightMaterial = definition.category === 'crew' ? shared.warm : definition.category === 'engineering' ? shared.amber : shared.cyan;
    for (const z of [-depth * 0.27, depth * 0.27]) {
      const light = new THREE.Mesh(normalizedBox(Math.min(3.5, width * 0.42), 0.04, 0.18, 'ceiling'), lightMaterial);
      light.position.set(0, height - 0.02, z);
      room.add(light);
    }

    const signCanvas = createPanelTexture(definition.label, [`DECK 01 // ${definition.category.toUpperCase()}`], 512, 180);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.56), screenMaterial(signCanvas));
    sign.position.set(innerX + (definition.side === 'left' ? -0.1 : 0.1), 2.72, 0);
    sign.rotation.y = definition.side === 'left' ? -Math.PI / 2 : Math.PI / 2;
    room.add(sign);

    // Technical ribs keep every room visually connected to the same ship kit.
    for (const z of [-depth * 0.38, 0, depth * 0.38]) {
      const rib = new THREE.Mesh(normalizedBox(0.11, height, 0.16, 'floor'), metal(0x52616a, 0.35, 0.88));
      rib.position.set(outerX + (outerX > 0 ? -0.12 : 0.12), 0, z);
      room.add(rib);
    }
    return room;
  }

  private wall(width: number, height: number, depth: number): THREE.Mesh {
    const wall = new THREE.Mesh(normalizedBox(width, height, depth, 'floor'), metal(0x22313a, 0.58, 0.72));
    const panel = new THREE.Mesh(normalizedBox(Math.max(0.06, width - 0.08), height - 0.3, Math.max(0.06, depth - 0.08), 'floor'), metal(0x293b45, 0.65, 0.64));
    panel.position.y = 0.15;
    wall.add(panel);
    return wall;
  }
}
