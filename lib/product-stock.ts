import { ProductType } from "@prisma/client"

type StockProduct = {
  type?: ProductType | null
  initialStock?: number | null
  stock: number
  price: number
}

export function productTypeLabel(type: ProductType) {
  switch (type) {
    case "LIQUID":
      return "Liquido"
    case "CHEMICAL":
      return "Quimico"
    case "PASTE":
      return "Pasta / creme"
    case "POWDER":
      return "Po / granulado"
    case "TOWEL":
      return "Pano / toalha"
    case "PAD":
      return "Boina / aplicador"
    case "TOOL":
      return "Ferramenta"
    case "CONSUMABLE":
      return "Consumivel"
    case "OTHER":
      return "Outro"
    default:
      return type
  }
}

export function defaultUnitForProductType(type: ProductType) {
  switch (type) {
    case "LIQUID":
    case "CHEMICAL":
      return "ml"
    case "PASTE":
    case "POWDER":
      return "g"
    case "TOWEL":
    case "PAD":
    case "TOOL":
    case "CONSUMABLE":
    case "OTHER":
      return "un"
    default:
      return "un"
  }
}

export function getProductUnitCost(product: StockProduct) {
  const initialStock = product.initialStock || product.stock || 0

  if (initialStock <= 0) {
    return 0
  }

  return product.price / initialStock
}

export function getProductStockValue(product: StockProduct) {
  return product.stock * getProductUnitCost(product)
}
