// Tools → Community (a static route, so it wins over tools/[tool]).
import React from 'react';
import { CommunityFeedScreen } from '../../src/screens/community';
export default function ToolsCommunity() { return <CommunityFeedScreen backTitle="Tools" />; }
