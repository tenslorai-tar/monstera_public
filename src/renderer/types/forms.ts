export type FormCreationTool =
  | 'form-text' | 'form-checkbox' | 'form-signature'
  | 'form-date' | 'form-button' | 'form-barcode'
  | 'form-radio' | 'form-dropdown' | 'form-listbox'

export interface FieldValidation {
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: string        // regex pattern string
  minValue?: number       // numeric min
  maxValue?: number       // numeric max
  errorMessage?: string   // custom error text
}

interface FormFieldBase {
  id: string
  pageNum: number
  fieldName: string
  rect: [number, number, number, number]  // PDF pts [x1_left, y1_bottom, x2_right, y2_top]
  readOnly: boolean
  isNew: boolean  // true = drawn by user, not yet saved to PDF
  tooltip?: string
}

export interface TextFormField extends FormFieldBase {
  type: 'text'
  value: string
  multiline: boolean
  maxLen?: number
  validation?: FieldValidation
  calculation?: string    // JS-style formula referencing other field names, e.g. "qty * price"
}

export interface CheckboxFormField extends FormFieldBase {
  type: 'checkbox'
  checked: boolean
  exportValue: string
}

export interface RadioFormField extends FormFieldBase {
  type: 'radio'
  groupName: string    // shared fieldName for the group
  exportValue: string  // this widget's export value
  selected: boolean
}

export interface DropdownFormField extends FormFieldBase {
  type: 'dropdown'
  options: string[]
  value: string
}

export interface ListBoxFormField extends FormFieldBase {
  type: 'listbox'
  options: string[]
  values: string[]
}

export interface SignatureFormField extends FormFieldBase {
  type: 'signature'
}

export interface DateFormField extends FormFieldBase {
  type: 'date'
  value: string    // ISO date string "YYYY-MM-DD"
  format: string   // display format e.g. "MM/DD/YYYY"
}

export interface ButtonFormField extends FormFieldBase {
  type: 'button'
  label: string
  backgroundColor: string
}

export interface BarcodeFormField extends FormFieldBase {
  type: 'barcode'
  value: string
  barcodeType: 'qr' | 'code128'
}

export type FormField =
  | TextFormField
  | CheckboxFormField
  | RadioFormField
  | DropdownFormField
  | ListBoxFormField
  | SignatureFormField
  | DateFormField
  | ButtonFormField
  | BarcodeFormField
