import type { Meta, StoryObj } from '@storybook/nextjs';
import Badge from './Badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'success', 'warning', 'error', 'info', 'outline'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
  args: { children: '진행 중', variant: 'primary', size: 'sm' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="default">대기</Badge>
      <Badge variant="primary">활성</Badge>
      <Badge variant="success">체결</Badge>
      <Badge variant="warning">검토 필요</Badge>
      <Badge variant="error">반려</Badge>
      <Badge variant="info">안내</Badge>
      <Badge variant="outline">필터</Badge>
    </div>
  ),
};
