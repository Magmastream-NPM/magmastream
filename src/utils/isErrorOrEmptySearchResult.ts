import { LoadTypes } from "../structures/Enums";
import { ErrorOrEmptySearchResult, SearchResult } from "../structures/Types";

export default function isErrorOrEmptySearchResult(res: SearchResult): res is ErrorOrEmptySearchResult {
	return res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error;
}
