import { useEffect, useRef, useState } from 'react';

export function getShortestAngleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

interface CinematicAngleOptions {
  alpha?: number;
  deadband?: number;
  maxStep?: number;
}

export function useCinematicAngle(
  target: number,
  {
    alpha = 0.15,
    deadband = 1,
    maxStep = 10,
  }: CinematicAngleOptions = {},
): number {
  const [angle, setAngle] = useState(target);
  const angleRef = useRef(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    angleRef.current = angle;
  }, [angle]);

  useEffect(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const animate = () => {
      const delta = getShortestAngleDelta(angleRef.current, target);

      if (Math.abs(delta) <= deadband) {
        const settledAngle = angleRef.current + delta;
        angleRef.current = settledAngle;
        setAngle(settledAngle);
        frameRef.current = null;
        return;
      }

      const nextStep = Math.sign(delta) * Math.min(Math.abs(delta) * alpha, maxStep);
      const nextAngle = angleRef.current + nextStep;
      angleRef.current = nextAngle;
      setAngle(nextAngle);
      frameRef.current = window.requestAnimationFrame(animate);
    };

    frameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [alpha, deadband, maxStep, target]);

  return angle;
}
