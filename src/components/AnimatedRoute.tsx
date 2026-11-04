import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

export default function AnimatedRoute({ locationKey, children }: { locationKey: string; children: ReactNode }) {
  return <AnimatePresence mode="wait"><motion.div key={locationKey} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>{children}</motion.div></AnimatePresence>
}
