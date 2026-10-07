import { Pressable } from 'react-native';
import { Modal } from '@getpaseo/plugin/client/react-native';
import { AgentContent, type AgentContentProps } from './content';
export function AgentModal(props: Omit<AgentContentProps, 'surface'> & { open: boolean; onOpenChange: (value: boolean) => void }) {
  return <Pressable accessible={false} focusable={false} onPress={event => event.stopPropagation()}>
    <Modal title="에이전트" open={props.open} onOpenChange={props.onOpenChange}>
      <Modal.Content scrollable={!props.layout.compact} contentContainerStyle={{ padding: 12, gap: 8 }}>
        <AgentContent {...props} surface="modal" />
      </Modal.Content>
    </Modal>
  </Pressable>;
}
