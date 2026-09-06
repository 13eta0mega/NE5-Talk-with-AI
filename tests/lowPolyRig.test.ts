import { describe, expect, it } from 'vitest';
import { EMOTION_IDS } from '../src/core/types';
import { AVATARS, FACES, MOTIONS, createChibi, dialogueMotion, identity, matrix, multiply, poseRig, rigStats, speakingMouth, transform, visit } from '../src/renderer/three/rig';
import { exportGltf } from '../src/renderer/three/renderer';

describe('original low-poly companion rig', () => {
  it('builds five distinct original meshes with named articulation and bounded geometry', () => {
    expect(new Set(AVATARS.map(a => a.id)).size).toBe(5);
    expect(new Set(AVATARS.map(a => a.style)).size).toBe(5);
    for (const avatar of AVATARS) {
      const rig = createChibi(avatar.id), stats = rigStats(rig);
      expect(stats.triangles).toBeGreaterThan(1000);
      expect(stats.triangles).toBeLessThan(5000);
      for (const name of ['hips', 'head', 'earL', 'earR', 'armL', 'armR', 'elbowL', 'legL', 'kneeL', 'tail', 'mouth', 'eyeL']) expect(rig.joints[name]).toBeDefined();
      visit(rig.root, n => {
        if (!n.mesh) return;
        expect(n.mesh.positions.length % 9).toBe(0);
        expect(n.mesh.normals.length).toBe(n.mesh.positions.length);
        expect(Array.from(n.mesh.positions).every(Number.isFinite)).toBe(true);
      });
    }
  });
  it('maps every existing Gemini emotion, including crying, without removing facial parts', () => {
    expect(Object.keys(FACES).sort()).toEqual([...EMOTION_IDS].sort());
    const rig = createChibi(AVATARS[0].id), count = rigStats(rig).nodes;
    for (const emotion of EMOTION_IDS) {
      for (let i = 0; i < 90; i++) poseRig(rig, i / 60, 1 / 60, emotion);
      expect(rigStats(rig).nodes).toBe(count);
      expect(rig.face.tear).toBeCloseTo(FACES[emotion].tear, 3);
    }
  });
  it('interpolates expression transitions instead of swapping static pictures', () => {
    const rig = createChibi(AVATARS[0].id), start = rig.face.smile;
    poseRig(rig, 0, 1 / 60, 'angry');
    expect(rig.face.smile).toBeLessThan(start);
    expect(rig.face.smile).toBeGreaterThan(FACES.angry.smile);
    for (let i = 0; i < 90; i++) poseRig(rig, i / 60, 1 / 60, 'angry');
    expect(rig.face.smile).toBeCloseTo(FACES.angry.smile, 3);
  });
  it('applies the intensity control and rejects invalid audio levels', () => {
    const rig = createChibi(AVATARS[0].id);
    for (let i = 0; i < 90; i++) poseRig(rig, i / 60, 1 / 60, 'angry', 'auto', 0, 0);
    expect(rig.face.smile).toBeCloseTo(FACES.idle.smile, 3);
    expect(speakingMouth('speaking', NaN)).toBe(0);
    expect(speakingMouth('speaking', Infinity)).toBe(0);
    expect(speakingMouth('speaking', 9)).toBe(1);
  });
  it('uses actual output level only while speaking, never the microphone or thinking phase', () => {
    for (const phase of ['listening', 'thinking', 'idle', 'disconnected', 'reconnecting']) expect(speakingMouth(phase, .8)).toBe(0);
    expect(speakingMouth('speaking', .8)).toBe(.8);
    expect(speakingMouth('speaking', 0)).toBe(0);
  });
  it('runs repeated emotion/motion combinations without NaN, geometry growth, or missing joints', () => {
    for (const avatar of AVATARS) {
      const rig = createChibi(avatar.id), initial = rigStats(rig);
      for (let cycle = 0; cycle < 5; cycle++) for (const emotion of EMOTION_IDS) for (const motion of MOTIONS) {
        poseRig(rig, cycle + .31, 1 / 30, emotion, motion, .35, .8);
        for (const joint of Object.values(rig.joints)) expect([...joint.p, ...joint.r, ...joint.s].every(Number.isFinite)).toBe(true);
      }
      expect(rigStats(rig)).toEqual(initial);
    }
  });
  it('composes transforms in a real parent-child 3D hierarchy', () => {
    const m = multiply(matrix([1, 2, 3]), matrix([2, 0, 0]));
    expect(transform(m, [0, 0, 0])).toEqual([3, 2, 3]);
    expect(Array.from(multiply(identity(), m))).toEqual(Array.from(m));
  });
  it('exports editable glTF geometry and rigid joints without claiming a weighted skin', () => {
    for (const avatar of AVATARS) {
      const doc = JSON.parse(exportGltf(createChibi(avatar.id)));
      expect(doc.asset.version).toBe('2.0');
      expect(doc.extras.rigType).toBe('hierarchical-rigid');
      expect(doc.skins).toBeUndefined();
      expect(doc.meshes.length).toBeGreaterThan(30);
      const data = Buffer.from(doc.buffers[0].uri.split(',')[1], 'base64');
      expect(data.length).toBe(doc.buffers[0].byteLength);
      for (const view of doc.bufferViews) {
        expect(view.byteOffset % 4).toBe(0);
        expect(view.byteOffset + view.byteLength).toBeLessThanOrEqual(data.length);
      }
      for (const node of doc.nodes) for (const child of node.children || []) expect(child).toBeLessThan(doc.nodes.length);
    }
  });
  it('responds to explicit conversational gesture requests without extra API turns', () => {
    expect(dialogueMotion('\uc190 \ud754\ub4e4\uc5b4 \uc904\ub798?')).toBe('wave');
    expect(dialogueMotion('\ucda4\ucdb0\uc918')).toBe('dance');
    expect(dialogueMotion('Please nod')).toBe('nod');
    expect(dialogueMotion('What is the weather?')).toBeUndefined();
  });
});
