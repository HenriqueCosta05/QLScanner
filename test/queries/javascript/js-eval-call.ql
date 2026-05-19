/**
 * @name Direct eval call
 * @description Finds direct calls to eval, which can execute untrusted input.
 * @kind problem
 * @id qlscanner/js-eval-call
 * @problem.severity warning
 * @precision medium
 */

import javascript

from DataFlow::CallNode call
where call = DataFlow::globalVarRef("eval").getACall()
select call, "Avoid using eval() because it can execute arbitrary code."