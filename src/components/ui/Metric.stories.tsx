import type { Meta, StoryObj } from '@storybook/nextjs';
import Metric from './Metric';

const meta = {
  title: 'UI/Metric',
  component: Metric,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    value: { control: 'text' },
    unit: { control: 'text' },
  },
  args: { value: '128.4', unit: 'km', size: 'md' },
} satisfies Meta<typeof Metric>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-8">
      <Metric size="sm" value="42" unit="분" />
      <Metric size="md" value="128.4" unit="km" />
      <Metric size="lg" value={89000} unit="원" />
    </div>
  ),
};

/** 자릿수 정렬(tabular-nums) 검증 — 세로로 쌓아도 단위·자리가 정렬된다. */
export const TabularAlignment: Story = {
  render: () => (
    <div className="flex flex-col items-end gap-1">
      <Metric size="md" value="1,200" unit="원" />
      <Metric size="md" value="90" unit="원" />
      <Metric size="md" value="10,008" unit="원" />
    </div>
  ),
};
