export type FormCreationTool = 'form-text' | 'form-checkbox' | 'form-signature'

interface FormFieldBase {
  id: string
  pageNum: number
  fieldName: string
  rect: [number, number, number, number]  // PDF pts [x1_left, y1_bottom, x2_right, y2_top]
  readOnly: boolean
  isNew: boolean  // true = drawn by user, not yet saved to PDF
}

export interface TextFormField extends FormFieldBase {
  type: 'text'
  value: string
  multiline: boolean
  maxLen?: number
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

export type FormField =
  | TextFormField
  | CheckboxFormField
  | RadioFormField
  | DropdownFormField
  | ListBoxFormField
  | SignatureFormField
