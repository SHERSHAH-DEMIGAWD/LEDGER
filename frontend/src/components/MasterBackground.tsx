import { motion } from 'motion/react';

export function MasterBackground() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        backgroundImage: 'url(/ledger-master-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        pointerEvents: 'none',
      }}
    />
  );
}