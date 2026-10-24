import { IconPlus } from '@heroui/react'

type PrimaryActionButtonProps = {
  onClick: () => void
}

const PrimaryActionButton = ({ onClick }: PrimaryActionButtonProps) => {
  return (
    <button aria-label="Registrar nova venda" className="primary-action-button" onClick={onClick} type="button">
      <IconPlus className="primary-action-button-icon" />
    </button>
  )
}

export default PrimaryActionButton
