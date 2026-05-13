import React from 'react';
import { Header } from './Header';
import { ActivityBar } from './ActivityBar';
import { StatusBar } from './StatusBar';
import styles from './RootLayout.module.scss';

interface RootLayoutProps {
  children: React.ReactNode;
}

export const RootLayout: React.FC<RootLayoutProps> = ({ children }) => {
  return (
    <div className={styles.root}>
      <Header />
      <div className={styles.main}>
        <ActivityBar />
        <div className={styles.contentArea}>
          {children}
        </div>
      </div>
      <StatusBar />
    </div>
  );
};

export default RootLayout;
