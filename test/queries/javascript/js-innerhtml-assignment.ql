/**
 * @name innerHTML assignment
 * @description Finds assignments to innerHTML, which can introduce DOM-based XSS.
 * @kind problem
 * @id qlscanner/js-innerhtml-assignment
 * @problem.severity warning
 * @precision medium
 */

import javascript

from PropAccess access
where access.getPropertyName() = "innerHTML"
select access, "Avoid assigning directly to innerHTML because it can introduce DOM-based XSS."