import { useSettings, type PluginSurfaceProps } from '@getpaseo/plugin/client';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { verifierSettings, type VerifierSettings } from '../shared/settings';

export function VerifierSettingsScreen({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(verifierSettings);
  const [draft, setDraft] = useState<VerifierSettings | null>(null);
  useEffect(() => {
    if (settings.status === 'ready') setDraft(settings.values);
  }, [settings.status, settings.status === 'ready' ? settings.revision : null]);
  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: layout.compact ? 16 : 24, gap: 14 },
      label: { color: theme.colors.foreground, fontWeight: '600' as const },
      help: { color: theme.colors.foregroundMuted },
      input: { color: theme.colors.foreground, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: theme.colors.surface1 },
      row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
      button: { alignSelf: 'flex-start' as const, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.colors.accent },
      buttonText: { color: theme.colors.accentForeground },
      error: { color: theme.colors.statusDanger },
    }),
    [theme, layout.compact],
  );

  if (settings.status === 'loading' || !draft) return <View style={styles.screen} />;
  if (settings.status === 'error') return <Text style={[styles.error, { padding: 16 }]}>{settings.error}</Text>;
  const revision = settings.status === 'ready' || settings.status === 'invalid' ? settings.revision : '';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.help}>이 host의 Verifier 플러그인이 어디서 읽을지 정합니다. verifier가 이 기기에서 돈다면 모두 비워 둡니다.</Text>

      <Text style={styles.label}>원격 verifier SSH 대상</Text>
      <TextInput
        style={styles.input}
        value={draft.sshTarget}
        onChangeText={sshTarget => setDraft({ ...draft, sshTarget })}
        placeholder="비우면 이 기기"
        placeholderTextColor={theme.colors.foregroundMuted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="원격 verifier SSH 대상"
      />
      <Text style={styles.help}>verifier 기기의 읽기 전용 SSH(bootstrap verifier role의 verifier-logs)로 접속할 대상입니다. ssh config의 Host 이름을 권장합니다. 키는 이 기기의 ssh 설정을 그대로 씁니다.</Text>

      <Text style={styles.label}>01-software clone 경로</Text>
      <TextInput
        style={styles.input}
        value={draft.checkout}
        onChangeText={checkout => setDraft({ ...draft, checkout })}
        placeholder="비우면 verifier checkout 기본 위치"
        placeholderTextColor={theme.colors.foregroundMuted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="01-software clone 경로"
      />
      <Text style={styles.help}>커밋 제목과 GitHub 저장소를 이 clone에서 읽습니다. 원격 모드라면 이 기기의 01-software clone 경로를 넣습니다.</Text>

      <View style={styles.row}>
        <Switch value={draft.agentTool} onValueChange={agentTool => setDraft({ ...draft, agentTool })} accessibilityLabel="에이전트 도구 제공" />
        <Text style={styles.label}>에이전트에게 verifier_status 도구 제공</Text>
      </View>
      <Text style={styles.help}>01-software 저장소에서 일하는 에이전트에게만 줍니다. 바꾸면 열린 에이전트 세션은 다음 입력 전에 다시 열립니다.</Text>

      {settings.status === 'invalid' ? <Text style={styles.error}>저장된 설정이 잘못됐습니다: {settings.error}</Text> : null}
      {settings.saveError ? <Text style={styles.error}>{settings.saveError}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="설정 저장"
        disabled={settings.saving}
        onPress={() => void settings.save({ sshTarget: draft.sshTarget.trim(), checkout: draft.checkout.trim(), agentTool: draft.agentTool }, revision)}
        style={styles.button}
      >
        <Text style={styles.buttonText}>{settings.saving ? '저장 중…' : '저장'}</Text>
      </Pressable>
    </ScrollView>
  );
}
