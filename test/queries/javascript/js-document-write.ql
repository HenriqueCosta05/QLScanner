/**
 * @name document.write call
 * @description Finds direct calls to document.write, which can lead to XSS issues.
 * @kind problem
 * @id qlscanner/js-document-write
 * @problem.severity warning
 * @precision medium
 */

import javascript

from DataFlow::CallNode call
where
	exists(string method |
		method = "write" or method = "writeln"
		and call = DataFlow::globalVarRef("document").getAMemberCall(method)
	)
select call, "Avoid using document.write() or document.writeln() because they can introduce XSS risks."