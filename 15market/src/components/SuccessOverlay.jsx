import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const CheckmarkSVG = () => (
  <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
    <motion.circle
      cx="36" cy="36" r="32"
      stroke="#1A6140"
      strokeWidth="3"
      fill="none"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    />
    <motion.path
      d="M22 36 L32 46 L50 26"
      stroke="#1A6140"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.4, delay: 0.5, ease: 'easeOut' }}
    />
  </svg>
);

export default function SuccessOverlay({ show, title = 'WITHDRAWAL SUCCESSFUL', onDone }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      setExiting(false);
    }
  }, [show]);

  useEffect(() => {
    if (!visible || exiting) return;
    const timer = setTimeout(() => {
      setExiting(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [visible, exiting]);

  useEffect(() => {
    if (!exiting) return;
    const safetyTimer = setTimeout(() => {
      setExiting(false);
      setVisible(false);
      if (onDone) onDone();
    }, 800);
    return () => clearTimeout(safetyTimer);
  }, [exiting, onDone]);

  const handleExitComplete = useCallback(() => {
    if (exiting) {
      setExiting(false);
      setVisible(false);
      if (onDone) onDone();
    }
  }, [exiting, onDone]);

  const dismiss = () => {
    if (!exiting) setExiting(true);
  };

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {visible && (
        <motion.div
          key="success-overlay"
          className={`fixed inset-0 z-[10000] flex items-center justify-center cursor-pointer ${exiting ? 'pointer-events-none' : ''}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: exiting ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={dismiss}
        >
          {/* Backdrop blur */}
          <motion.div
            className="absolute inset-0 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: exiting ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />

          {/* Content */}
          <motion.div
            className="relative flex flex-col items-center gap-5"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: exiting ? 0.85 : 1, opacity: exiting ? 0 : 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
            >
              <CheckmarkSVG />
            </motion.div>

            <motion.p
              style={{ fontFamily: '"Comfortaa", cursive' }}
              className="text-white font-black text-sm md:text-base uppercase tracking-[0.25em] text-center leading-snug"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.25 }}
            >
              {title}
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
