'use client';

import React from 'react';
import { useDynamicSidebar } from './DynamicSidebarContext';
import { DynamicSidebarHeader } from './DynamicSidebarHeader';
import { DynamicSidebarContent } from './DynamicSidebarContent';
import { DynamicSidebarFooter } from './DynamicSidebarFooter';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export function DynamicSidebar() {
    const { isOpen } = useDynamicSidebar();

    return (
        <>
            {/* Mobile Backdrop */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
                        onClick={() => {/* Handle mobile close if needed */ }}
                    />
                )}
            </AnimatePresence>

            {/* Sidebar Container */}
            <motion.aside
                initial={false}
                animate={{
                    width: isOpen ? 300 : 72,
                    x: 0
                }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className={cn(
                    "fixed inset-y-0 left-0 z-50 flex flex-col h-screen bg-card border-r border-border",
                    "lg:relative lg:translate-x-0"
                )}
            >
                <DynamicSidebarHeader />
                <DynamicSidebarContent />
                <DynamicSidebarFooter />
            </motion.aside>
        </>
    );
}
