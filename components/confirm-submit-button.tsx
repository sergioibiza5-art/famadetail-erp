"use client"

import { ReactNode } from "react"

type ConfirmSubmitButtonProps = {
  children: ReactNode
  className?: string
  message: string
  title?: string
}

export function ConfirmSubmitButton({
  children,
  className,
  message,
  title,
}: ConfirmSubmitButtonProps) {
  return (
    <button
      className={className}
      title={title}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault()
        }
      }}
    >
      {children}
    </button>
  )
}
