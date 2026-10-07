import { Pressable } from 'react-native';
import { Modal } from '@getpaseo/plugin/client/react-native';
import { GraphContent, type GraphContentProps } from './content';
export function GraphModal(props: Omit<GraphContentProps, 'surface'> & { open: boolean; onOpenChange: (value: boolean) => void }) {
  return <Pressable accessible={false} focusable={false} onPress={event => event.stopPropagation()}>
    <Modal title="에이전트" open={props.open} onOpenChange={props.onOpenChange}>
      <Modal.Content scrollable={!props.layout.compact} contentContainerStyle={{ padding: 12, gap: 8 }}>
        <GraphContent {...props} surface="modal" />
      </Modal.Content>
    </Modal>
  </Pressable>;
}
