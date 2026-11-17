import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { PluginScreenProps } from '@getpaseo/plugin/client';

// 0.15/0.16 명령 콜백에는 navigation이 없다. 화면의 공식 navigation으로 이동한다.
export function OpenAgent({ params, navigation, theme, layout }: PluginScreenProps) {
  const opened = useRef('');
  const { agentId, serverId } = params;
  const open = () => {
    if (agentId && serverId) navigation?.openAgent({ agentId, serverId });
  };
  useEffect(() => {
    const key = `${serverId}/${agentId}`;
    if (navigation && agentId && serverId && opened.current !== key) {
      opened.current = key;
      navigation.openAgent({ agentId, serverId });
    }
  }, [agentId, serverId, navigation]);
  return <View style={{ flex: 1, padding: layout.compact ? 16 : 24, gap: 16, backgroundColor: theme.colors.surface0 }}>
    <Text style={{ color: theme.colors.foreground, fontSize: 16 }}>
      {navigation ? '감독 대화를 여는 중입니다.' : '이 앱에서는 대화 이동을 지원하지 않습니다. Paseo 앱을 업데이트하세요.'}
    </Text>
    {navigation && <Pressable accessibilityRole="button" onPress={open} style={{ padding: 12 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 16 }}>감독 대화 열기</Text>
    </Pressable>}
  </View>;
}
