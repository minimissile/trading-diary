import { ExclamationCircleFilled } from '@ant-design/icons';
import type { ModalFuncProps } from 'antd';
import { createElement } from 'react';

/**
 * 为确认对话框注入居中展示、危险操作图标等统一默认值。
 * @param props Ant Design Modal.confirm 参数
 * @returns 合并后的参数
 */
export function withConfirmDefaults(props: ModalFuncProps): ModalFuncProps {
  const isDanger = props.okButtonProps?.danger === true;
  return {
    centered: true,
    icon:
      props.icon ??
      createElement(ExclamationCircleFilled, {
        className: isDanger
          ? 'confirm-dialog-icon confirm-dialog-icon--danger'
          : 'confirm-dialog-icon confirm-dialog-icon--warning',
      }),
    ...props,
  };
}

/**
 * 危险操作确认框（删除等），统一图标与按钮样式。
 */
export function confirmDanger(confirm: (props: ModalFuncProps) => unknown, props: ModalFuncProps): void {
  confirm(
    withConfirmDefaults({
      ...props,
      okButtonProps: { ...props.okButtonProps, danger: true },
    }),
  );
}
