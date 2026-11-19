// Community tab (route /forum, so it does not clash with the pushed /community feed): the community feed in
// tab-root mode — large title, no back button, New post above the system tab bar.
import React from 'react';
import { CommunityFeedScreen } from '../../src/screens/community';
export default function CommunityTab() { return <CommunityFeedScreen tabRoot />; }
