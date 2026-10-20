import { ArrowUp, ArrowDown } from 'lucide-react'

export default function StatCard({ title, value, percentage, icon: Icon, iconBgColor }) {
  const isPositive = percentage >= 0;
  return (
    <div className="bg-gray-800 p-4 rounded-lg flex items-center">
      <div className={`p-2 rounded-full ${iconBgColor}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="ml-4">
        <p className="text-sm text-gray-400">{title}</p>
        <p className="text-xl font-bold">{value}</p>
        <div className={`flex items-center text-sm ${isPositive ? 'text-[#1A6140]' : 'text-red-500'}`}>
          {isPositive ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
          <span>{Math.abs(percentage)}%</span>
        </div>
      </div>
    </div>
  )
}
