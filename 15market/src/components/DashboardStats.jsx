import StatCard from './StatCard'
import { DollarSign, BarChart2, Briefcase, CheckCircle } from 'lucide-react'

export default function DashboardStats() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Current Price"
        value="$43,300.55"
        percentage={1.85}
        icon={DollarSign}
        iconBgColor="bg-[#1A6140]"
      />
      <StatCard
        title="24h Volume"
        value="8.5B"
        percentage={-0.45}
        icon={BarChart2}
        iconBgColor="bg-red-500"
      />
      <StatCard
        title="Market Cap"
        value="850B"
        percentage={-2.11}
        icon={Briefcase}
        iconBgColor="bg-[#1A6140]"
      />
      <StatCard
        title="Open Trades"
        value="12"
        percentage={0.00}
        icon={CheckCircle}
        iconBgColor="bg-gray-500"
      />
    </div>
  )
}
