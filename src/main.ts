import { createApp } from './app/app.ts'
import { createCustomerPage } from './app/customer-page.ts'
import { createPropertyPage } from './app/property-page.ts'

createApp()
createCustomerPage(document)
createPropertyPage(document)
