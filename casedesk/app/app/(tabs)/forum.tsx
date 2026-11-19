// Community tab (route /forum, so it does not clash with the pushed /community feed): hosts the existing community feed (src/screens/community.tsx, also at /community).
// <TabHost> tells the kit this stack screen is a tab root: no back button, room for the tab bar.
import React from 'react';
import { TabHost } from '../../src/ui';
import { CommunityFeedScreen } from '../../src/screens/community';
export default function CommunityTab() { return <TabHost><CommunityFeedScreen backTitle="Home" /></TabHost>; }
