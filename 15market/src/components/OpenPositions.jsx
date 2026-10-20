export default function OpenPositions() {
  const positions = [
    { id: 1, value: '$1230.00', isPositive: true },
    { id: 2, value: '$5250.00', isPositive: true },
    { id: 3, value: '-$120.50', isPositive: false },
  ]

  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <h2 className="text-lg font-bold">Open Positions (3)</h2>
      <ul className="mt-4 space-y-2">
        {positions.map(position => (
          <li key={position.id} className="flex justify-between items-center">
            <span>Position {position.id}</span>
            <span className={position.isPositive ? 'text-[#1A6140]' : 'text-red-500'}>
              {position.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
