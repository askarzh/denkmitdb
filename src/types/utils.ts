export enum DataTypes {
	Entry = 0,
	Pollard = 1,
	Identity = 2,
	Manifest = 3,
	Head = 4
}

export type DataType = {
	dataType: DataTypes;
};

export type CIDstring = string;
